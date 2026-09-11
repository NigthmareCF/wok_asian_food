"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  initialOrders,
  type KitchenChangeItem,
  type OrderAccount,
  type OrderChannel,
  type OrderItem,
  type OrderRecord,
  type OrderStatus,
} from "@/data/fixtures/orders";

type CreateOrderInput = {
  channel: OrderChannel;
  source: string;
  items: OrderItem[];
  accountId?: string;
  accountName?: string;
  accounts?: OrderAccount[];
};

type OrderSessionContextValue = {
  orders: OrderRecord[];
  tableAccounts: Record<string, OrderAccount[]>;
  createOrder: (input: CreateOrderInput) => string;
  updateOrderItems: (orderId: string, items: OrderItem[]) => boolean;
  updateOrderStatus: (orderId: string, status: OrderStatus) => boolean;
  updateOrderEta: (orderId: string, eta: string) => boolean;
  markOrdersPaid: (orderIds: string[]) => void;
  createTableAccount: (source: string, name: string) => OrderAccount;
  clearTableAccounts: (source: string) => void;
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
  const [tableAccounts, setTableAccounts] = useState<
    Record<string, OrderAccount[]>
  >({});

  const value = useMemo<OrderSessionContextValue>(
    () => ({
      orders,
      tableAccounts,
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
          accountId: input.accountId,
          accountName: input.accountName,
          accounts: input.accounts,
          status: "sent",
          createdAt: now,
          elapsed: "Ahora",
          eta: "18 min",
          responsible: "Antony",
          items: input.items,
          kitchenUpdates: 0,
          kitchenChanges: [],
          paymentStatus: "pending",
        };
        setOrders((current) => [order, ...current]);
        return id;
      },
      updateOrderItems(orderId, items) {
        const currentOrder = orders.find((order) => order.id === orderId);
        if (!currentOrder) return false;
        const previousById = new Map(
          currentOrder.items.map((item) => [item.id, item]),
        );
        const changes: KitchenChangeItem[] = [];
        items.forEach((item) => {
          const previous = previousById.get(item.id);
          if (!previous) {
            changes.push({
              itemId: item.id,
              name: item.name,
              action: "added",
              quantity: item.quantity,
              fulfillment: item.fulfillment,
              readyAt: item.readyAt,
            });
            return;
          }
          previousById.delete(item.id);
          if (JSON.stringify(previous) === JSON.stringify(item)) return;
          changes.push({
            itemId: item.id,
            name: item.name,
            action: "updated",
            quantity: item.quantity,
            previousQuantity: previous.quantity,
            fulfillment: item.fulfillment,
            readyAt: item.readyAt,
          });
        });
        previousById.forEach((item) => {
          changes.push({
            itemId: item.id,
            name: item.name,
            action: "removed",
            quantity: 0,
            previousQuantity: item.quantity,
          });
        });
        if (changes.length === 0) return false;

        const notifyKitchen = currentOrder.status !== "new";
        const sentAt = new Date().toLocaleTimeString("es-GT", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  items,
                  kitchenUpdates:
                    order.kitchenUpdates + (notifyKitchen ? 1 : 0),
                  kitchenChanges: notifyKitchen
                    ? [
                        ...order.kitchenChanges,
                        {
                          id: `${order.id}-update-${order.kitchenUpdates + 1}`,
                          sentAt,
                          items: changes,
                        },
                      ]
                    : order.kitchenChanges,
                  paymentStatus: "pending",
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
      updateOrderEta(orderId, eta) {
        if (!orders.some((order) => order.id === orderId)) return false;
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId ? { ...order, eta } : order,
          ),
        );
        return true;
      },
      markOrdersPaid(orderIds) {
        const selectedIds = new Set(orderIds);
        setOrders((current) =>
          current.map((order) =>
            selectedIds.has(order.id)
              ? { ...order, paymentStatus: "paid" }
              : order,
          ),
        );
      },
      createTableAccount(source, name) {
        const account = {
          id: `account-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: name.trim(),
        };
        setTableAccounts((current) => ({
          ...current,
          [source]: [...(current[source] ?? []), account],
        }));
        return account;
      },
      clearTableAccounts(source) {
        setTableAccounts((current) => {
          const next = { ...current };
          delete next[source];
          return next;
        });
      },
    }),
    [orders, tableAccounts],
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
