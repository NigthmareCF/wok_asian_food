"use client";

import { createContext, useContext, useState } from "react";
import { menuFixtures } from "@/data/fixtures/menu";
import type { OrderChannel } from "@/data/fixtures/orders";
import {
  addCartItem,
  changeCartQuantity,
  type CartInput,
  type CartItem,
} from "./lib/cart";
import { usePendingRequest } from "./use-pending-request";

type CartContextValue = ReturnType<typeof usePendingRequest> & {
  items: readonly CartItem[];
  service: OrderChannel | "";
  addItem: (input: CartInput) => void;
  setQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  setService: (service: OrderChannel | "") => void;
};
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<readonly CartItem[]>([]);
  const [service, setService] = useState<OrderChannel | "">("");
  const pending = usePendingRequest();
  return (
    <CartContext
      value={{
        items,
        service,
        ...pending,
        addItem: (input) => {
          pending.cancelPendingRequest();
          setItems((current) => addCartItem(current, input, menuFixtures));
        },
        setQuantity: (id, quantity) => {
          pending.cancelPendingRequest();
          setItems((current) =>
            changeCartQuantity(current, id, quantity, menuFixtures),
          );
        },
        removeItem: (id) => {
          pending.cancelPendingRequest();
          setItems((current) => current.filter((entry) => entry.id !== id));
        },
        setService: (next) => {
          pending.cancelPendingRequest();
          setService(next);
        },
      }}
    >
      {children}
    </CartContext>
  );
}
export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
