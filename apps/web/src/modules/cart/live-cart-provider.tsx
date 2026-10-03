"use client";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import { createLiveCartStore, type LiveCartItem } from "./live-cart-storage";

type LiveCartContextValue = Pick<
  ReturnType<typeof createLiveCartStore>,
  "add" | "setQuantity" | "remove" | "complete"
> & { items: readonly LiveCartItem[] };
const LiveCartContext = createContext<LiveCartContextValue | null>(null);

export function LiveCartProvider({ children }: { children: React.ReactNode }) {
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
        add: store.add,
        setQuantity: store.setQuantity,
        remove: store.remove,
        complete: store.complete,
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
