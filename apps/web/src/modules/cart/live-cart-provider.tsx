"use client";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import { createLiveCartStore, type LiveCartItem } from "./live-cart-storage";
import { clientIdentityStore } from "@/modules/clients/client-identity-store";
import { useClientIdentity } from "@/modules/clients/use-client-identity";

type LiveCartContextValue = Pick<
  ReturnType<typeof createLiveCartStore>,
  "setQuantity" | "remove" | "complete"
> & { items: readonly LiveCartItem[] };
type LiveCartContextValueWithAdd = LiveCartContextValue & {
  add: (product: Parameters<ReturnType<typeof createLiveCartStore>["add"]>[0]) => Promise<boolean>;
};
const LiveCartContext = createContext<LiveCartContextValueWithAdd | null>(null);

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
        add: async (product) => {
          let currentIdentity = identity;
          if (currentIdentity.status === "unverified") {
            currentIdentity = await clientIdentityStore.refresh();
          }
          return store.add(product, currentIdentity);
        },
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
