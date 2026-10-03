import type { PublicMenuItem } from "@/modules/menu/public-menu";

export type LiveCartItem = {
  productId: string;
  name: string;
  quantity: number;
};
export const liveCartStorageKey = "wok.cart.catalog.v1";
const empty: readonly LiveCartItem[] = [];

function validItem(value: unknown): value is LiveCartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LiveCartItem>;
  return (
    typeof item.productId === "string" &&
    item.productId.length > 0 &&
    item.productId.length <= 100 &&
    typeof item.name === "string" &&
    item.name.length > 0 &&
    item.name.length <= 500 &&
    Number.isSafeInteger(item.quantity) &&
    item.quantity! >= 1 &&
    item.quantity! <= 100
  );
}

export function createLiveCartStore() {
  let snapshot = empty;
  let loaded = false;
  const listeners = new Set<() => void>();
  function read() {
    if (!loaded && typeof window !== "undefined") {
      loaded = true;
      try {
        const raw = window.sessionStorage.getItem(liveCartStorageKey);
        const parsed: unknown =
          raw && raw.length <= 40_000 ? JSON.parse(raw) : null;
        if (
          Array.isArray(parsed) &&
          parsed.length <= 50 &&
          parsed.every(validItem) &&
          new Set(parsed.map((item) => item.productId)).size === parsed.length
        ) {
          snapshot = parsed.map(({ productId, name, quantity }) => ({
            productId,
            name,
            quantity,
          }));
        }
      } catch {
        /* El carrito sigue disponible en memoria. */
      }
    }
    return snapshot;
  }
  function update(next: readonly LiveCartItem[]) {
    loaded = true;
    snapshot = next;
    try {
      window.sessionStorage.setItem(liveCartStorageKey, JSON.stringify(next));
    } catch {
      /* El almacenamiento puede estar bloqueado. */
    }
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: read,
    getServerSnapshot: () => empty,
    subscribe(listener: () => void) {
      listeners.add(listener);
      const logout = () => update(empty);
      window.addEventListener("wok:logout", logout);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("wok:logout", logout);
      };
    },
    add(product: PublicMenuItem) {
      const current = read();
      const existing = current.find((item) => item.productId === product.id);
      if (
        (existing?.quantity ?? 0) >= 100 ||
        (!existing && current.length >= 50)
      )
        return false;
      const next = {
        productId: product.id,
        name: product.name,
        quantity: (existing?.quantity ?? 0) + 1,
      };
      if (!validItem(next)) return false;
      update(
        existing
          ? current.map((item) => (item.productId === product.id ? next : item))
          : [...current, next],
      );
      return true;
    },
    setQuantity(id: string, quantity: number) {
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100)
        return;
      update(
        read().map((item) =>
          item.productId === id ? { ...item, quantity } : item,
        ),
      );
    },
    remove(id: string) {
      update(read().filter((item) => item.productId !== id));
    },
    complete(submitted: readonly { menuItemId: string; quantity: number }[]) {
      update(
        read().filter(
          (item) =>
            !submitted.some(
              (line) =>
                line.menuItemId === item.productId &&
                line.quantity === item.quantity,
            ),
        ),
      );
    },
  };
}
