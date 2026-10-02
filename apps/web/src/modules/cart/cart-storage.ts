import { menuFixtures } from "@/data/fixtures/menu";
import type { OrderChannel } from "@/data/fixtures/orders";
import { addCartItem, type CartItem } from "./lib/cart";

const storageKey = "wok.cart.v1";
export type StoredCart = {
  items: readonly CartItem[];
  service: OrderChannel | "";
};
const emptyCart: StoredCart = { items: [], service: "" };

export function readCartStorage(): StoredCart {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw || raw.length > 20_000) return emptyCart;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("items" in parsed))
      return emptyCart;
    const value = parsed as { items: unknown; service?: unknown };
    if (!Array.isArray(value.items) || value.items.length > 50)
      return emptyCart;
    let items: readonly CartItem[] = [];
    for (const entry of value.items) {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof entry.productId !== "string" ||
        !Number.isSafeInteger(entry.quantity) ||
        entry.quantity < 1 ||
        entry.quantity > 100 ||
        !entry.selectedOptions ||
        typeof entry.selectedOptions !== "object" ||
        Array.isArray(entry.selectedOptions) ||
        Object.values(entry.selectedOptions).some(
          (choice) => typeof choice !== "string",
        )
      )
        return emptyCart;
      items = addCartItem(items, entry, menuFixtures);
    }
    const service = ["table", "pickup", "delivery"].includes(
      String(value.service),
    )
      ? (value.service as OrderChannel)
      : "";
    return { items, service };
  } catch {
    return emptyCart;
  }
}

export function writeCartStorage(cart: StoredCart) {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(cart));
  } catch {
    // The cart remains usable in memory when browser storage is unavailable.
  }
}

export function clearCartStorage() {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // The page can still complete logout without browser storage.
  }
}

export function createCartStore() {
  let snapshot = emptyCart;
  let loaded = false;
  const listeners = new Set<() => void>();
  function notify(next: StoredCart) {
    snapshot = next;
    writeCartStorage(next);
    listeners.forEach((listener) => listener());
  }
  return {
    getServerSnapshot: () => emptyCart,
    getSnapshot: () => {
      if (!loaded && typeof window !== "undefined") {
        snapshot = readCartStorage();
        loaded = true;
      }
      return snapshot;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      const onLogout = () => {
        clearCartStorage();
        snapshot = emptyCart;
        listeners.forEach((current) => current());
      };
      window.addEventListener("wok:logout", onLogout);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("wok:logout", onLogout);
      };
    },
    updateItems(update: (items: readonly CartItem[]) => readonly CartItem[]) {
      notify({
        ...this.getSnapshot(),
        items: update(this.getSnapshot().items),
      });
    },
    updateService(service: OrderChannel | "") {
      notify({ ...this.getSnapshot(), service });
    },
    clear() {
      notify({ items: [], service: this.getSnapshot().service });
    },
  };
}
