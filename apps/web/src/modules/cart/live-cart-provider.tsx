"use client";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import { createLiveCartStore, type LiveCartItem } from "./live-cart-storage";
import { useClientIdentity } from "@/modules/clients/use-client-identity";

type LiveCartContextValue = Pick<
  ReturnType<typeof createLiveCartStore>,
  "add" | "setQuantity" | "remove" | "complete"
> & { items: readonly LiveCartItem[] };
const LiveCartContext = createContext<LiveCartContextValue | null>(null);

export function LiveCartProvider({ children }: { children: React.ReactNode }) {
  const { identity } = useClientIdentity();
  const [store] = useState(createLiveCartStore);
  const items = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return (
    <LiveCartContext
      value={{
        items,
        add: (product) => store.add(product, identity),
        setQuantity: (id, quantity) =>
          store.setQuantity(id, quantity, identity),
        remove: (id) => store.remove(id, identity),
        complete: (submitted) => store.complete(submitted, identity),
      }}
    >
      {children}
    </LiveCartContext>
  );
}

export function useLiveCart() {
  const cart = useContext(LiveCartContext);
  if (!cart)
    throw new Error("useLiveCart must be used inside LiveCartProvider");
  return cart;
}
