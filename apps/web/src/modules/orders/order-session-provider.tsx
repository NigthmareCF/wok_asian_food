"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  initialOrders,
  type OrderChannel,
  type OrderItem,
  type OrderRecord,
  type OrderStatus,
} from "@/data/fixtures/orders";

type CreateOrderInput = {
  channel: OrderChannel;
  source: string;
  items: OrderItem[];
};

type OrderSessionContextValue = {
  orders: OrderRecord[];
  createOrder: (input: CreateOrderInput) => string;
  updateOrderItems: (orderId: string, items: OrderItem[]) => boolean;
  updateOrderStatus: (orderId: string, status: OrderStatus) => boolean;
};

const OrderSessionContext = createContext<OrderSessionContextValue | null>(
  null,
);

export function OrderSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [orders, setOrders] = useState<OrderRecord[]>(initialOrders);

  const value = useMemo<OrderSessionContextValue>(
    () => ({
      orders,
      createOrder(input) {
        const prefix =
          input.channel === "delivery"
            ? "D"
            : input.channel === "pickup"
              ? "R"
              : "A";
        const sequence =
          orders
            .filter((order) => order.id.startsWith(`${prefix}-`))
            .map((order) => Number(order.id.split("-")[1]))
            .reduce((highest, current) => Math.max(highest, current), 100) + 1;
        const id = `${prefix}-${String(sequence).padStart(3, "0")}`;
        const now = new Date().toLocaleTimeString("es-GT", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const order: OrderRecord = {
          id,
          channel: input.channel,
          source: input.source,
          status: "sent",
          createdAt: now,
          elapsed: "Ahora",
          eta: "18 min",
          responsible: "Antony",
          items: input.items,
          kitchenUpdates: 0,
        };
        setOrders((current) => [order, ...current]);
        return id;
      },
      updateOrderItems(orderId, items) {
        if (!orders.some((order) => order.id === orderId)) return false;
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  items,
                  kitchenUpdates: order.kitchenUpdates + 1,
                }
              : order,
          ),
        );
        return true;
      },
      updateOrderStatus(orderId, status) {
        if (!orders.some((order) => order.id === orderId)) return false;
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId ? { ...order, status } : order,
          ),
        );
        return true;
      },
    }),
    [orders],
  );

  return (
    <OrderSessionContext.Provider value={value}>
      {children}
    </OrderSessionContext.Provider>
  );
}

export function useOrderSession() {
  const context = useContext(OrderSessionContext);
  if (!context) {
    throw new Error("useOrderSession must be used inside OrderSessionProvider");
  }
  return context;
}
