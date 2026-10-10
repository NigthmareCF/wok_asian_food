import { afterEach, expect, it, vi } from "vitest";
import { createClientIdentityStore } from "./client-identity-store";
const deferred = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
afterEach(() => vi.unstubAllGlobals());

it("rejects out of order session responses even when fetch ignores abort", async () => {
  const old = deferred();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(Response.json({ user: { userId: "B" } })),
  );
  const store = createClientIdentityStore();
  const unsubscribe = store.subscribe(() => {});
  await store.refresh();
  const scope = store.getSnapshot();
  old.resolve(Response.json({ user: { userId: "A" } }));
  await old.promise;
  await Promise.resolve();
  expect(store.getSnapshot()).toEqual(scope);
  expect(scope.ownerId).toBe("B");
  unsubscribe();
});

it("does not restore the old generation on A to B to A", async () => {
  let owner = "A";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ user: { userId: owner } })),
  );
  const store = createClientIdentityStore();
  const unsubscribe = store.subscribe(() => {});
  await store.refresh();
  const original = store.getSnapshot();
  owner = "B";
  await store.refresh();
  owner = "A";
  await store.refresh();
  expect(store.getSnapshot().ownerId).toBe("A");
  expect(store.matches(original)).toBe(false);
  unsubscribe();
});

it("invalidates session JSON processing before starting the next verification", async () => {
  let finish!: (body: unknown) => void;
  const json = new Promise<unknown>((done) => {
    finish = done;
  });
  const started = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => {
          started();
          return json;
        },
      })
      .mockResolvedValueOnce(Response.json({ user: { userId: "B" } })),
  );
  const store = createClientIdentityStore();
  const old = store.refresh();
  await Promise.resolve();
  expect(started).toHaveBeenCalled();
  await store.refresh();
  const current = store.getSnapshot();
  finish({ user: { userId: "A" } });
  await old;
  expect(store.getSnapshot()).toEqual(current);
  expect(current.ownerId).toBe("B");
});

it("keeps failed or malformed verification unverified; only 401 creates a visitor", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({}, { status: 401 })),
  );
  const store = createClientIdentityStore();
  await store.refresh();
  expect(store.getSnapshot().status).toBe("unverified");
  await store.refresh();
  expect(store.getSnapshot().status).toBe("unverified");
  await store.refresh();
  expect(store.getSnapshot().status).toBe("guest");
});

it("shares listeners until last unsubscribe, then removes browser subscriptions", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ user: { userId: "A" } })),
  );
  const store = createClientIdentityStore();
  const first = store.subscribe(() => {}),
    second = store.subscribe(() => {});
  await store.refresh();
  first();
  expect(store.getSnapshot().status).toBe("verified");
  second();
  expect(store.getSnapshot().status).toBe("unverified");
  const generation = store.getSnapshot().generation;
  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("wok:logout"));
  expect(store.getSnapshot().generation).toBe(generation);
});
