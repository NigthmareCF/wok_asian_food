import { afterEach, expect, it, vi } from "vitest";
import { createClientIdentityStore } from "@/modules/clients/client-identity-store";
import { createLiveCartStore, liveCartOwnerKey } from "./live-cart-storage";
const product = {
  id: "product",
  name: "Producto",
  price: 68,
  currency: "GTQ",
  estimatedPreparationSeconds: 60,
};
afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

it("separates visitor, A and B; never adopts ownerless v1 and rejects stale completion", async () => {
  let owner: string | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      owner
        ? Response.json({ user: { userId: owner } })
        : Response.json({}, { status: 401 }),
    ),
  );
  sessionStorage.setItem(
    "wok.cart.catalog.v1",
    JSON.stringify([{ productId: "old", name: "Antiguo", quantity: 1 }]),
  );
  const identity = createClientIdentityStore(),
    store = createLiveCartStore(identity);
  expect(store.add(product)).toBe(false);
  await identity.refresh();
  expect(store.getSnapshot()).toEqual([]);
  store.add({ ...product, name: "Visitante" });
  owner = "A";
  await identity.refresh();
  expect(store.getSnapshot()).toEqual([]);
  store.add(product);
  const a = identity.getSnapshot();
  owner = "B";
  await identity.refresh();
  expect(store.getSnapshot()).toEqual([]);
  store.add({ ...product, name: "B" });
  store.complete([{ menuItemId: product.id, quantity: 1 }], a);
  expect(store.getSnapshot()[0].name).toBe("B");
  owner = "A";
  await identity.refresh();
  store.complete([{ menuItemId: product.id, quantity: 1 }], a);
  expect(store.getSnapshot()).toHaveLength(1);
  owner = null;
  await identity.refresh();
  expect(store.getSnapshot()[0].name).toBe("Visitante");
  expect(sessionStorage.getItem("wok.cart.catalog.v1")).not.toBeNull();
});

it("validates only the verified owner's storage and enforces limits", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ user: { userId: "A" } })),
  );
  const identity = createClientIdentityStore();
  await identity.refresh();
  const key = liveCartOwnerKey(identity.getSnapshot());
  for (const quantity of [-1, 0, 101, 1.5]) {
    sessionStorage.setItem(
      key,
      JSON.stringify([{ productId: product.id, name: product.name, quantity }]),
    );
    expect(createLiveCartStore(identity).getSnapshot()).toEqual([]);
  }
  sessionStorage.removeItem(key);
  const store = createLiveCartStore(identity);
  store.add(product);
  store.setQuantity(product.id, 100);
  expect(store.add(product)).toBe(false);
  store.setQuantity(product.id, 101);
  expect(store.getSnapshot()[0].quantity).toBe(100);
});
