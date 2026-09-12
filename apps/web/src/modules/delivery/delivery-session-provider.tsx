"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  deliveryOrders,
  deliveryDrivers,
  getDeliveryTotal,
  type DeliveryOrder,
  type DeliveryOrderItem,
  type DeliveryOrderStatus,
  type Driver,
} from "@/data/fixtures/delivery";

type UpdateDeliveryStatusInput = {
  orderId: string;
  status: DeliveryOrderStatus;
  driverId?: string;
};

type AssignDriverInput = {
  orderId: string;
  driverId: string;
};

type CreateDeliveryOrderInput = {
  customer: string;
  address: string;
  phone: string;
  items: DeliveryOrderItem[];
  paymentMethod?: DeliveryOrder["paymentMethod"];
  notes?: string;
  eta?: string;
  isDemo?: boolean;
};

type DeliverySessionContextValue = {
  orders: DeliveryOrder[];
  drivers: Driver[];
  updateDeliveryStatus: (input: UpdateDeliveryStatusInput) => boolean;
  assignDriver: (input: AssignDriverInput) => boolean;
  updateDriverStatus: (driverId: string, status: Driver["status"]) => boolean;
  createDeliveryOrder: (input: CreateDeliveryOrderInput) => string;
};

const DeliverySessionContext = createContext<DeliverySessionContextValue | null>(null);

export function DeliverySessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [orders, setOrders] = useState<DeliveryOrder[]>(deliveryOrders);
  const [drivers, setDrivers] = useState<Driver[]>(deliveryDrivers);

  const value = useMemo<DeliverySessionContextValue>(
    () => ({
      orders,
      drivers,
      updateDeliveryStatus({ orderId, status, driverId }) {
        const order = orders.find((o) => o.id === orderId);
        if (!order) return false;

        setOrders((current) =>
          current.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status,
                  driver: driverId
                    ? drivers.find((d) => d.id === driverId)?.name ?? order.driver
                    : order.driver,
                  driverPhone: driverId
                    ? drivers.find((d) => d.id === driverId)?.phone ?? order.driverPhone
                    : order.driverPhone,
                  vehicle: driverId
                    ? drivers.find((d) => d.id === driverId)?.vehicle ?? order.vehicle
                    : order.vehicle,
                }
              : o,
          ),
        );

        if (driverId && status === "picked-up") {
          setDrivers((current) =>
            current.map((d) =>
              d.id === driverId ? { ...d, status: "on-delivery", currentOrderId: orderId } : d,
            ),
          );
        } else if (driverId && (status === "delivered" || status === "cancelled")) {
          setDrivers((current) =>
            current.map((d) =>
              d.id === driverId
                ? { ...d, status: "available", currentOrderId: undefined }
                : d,
            ),
          );
        }

        return true;
      },
      assignDriver({ orderId, driverId }) {
        const order = orders.find((o) => o.id === orderId);
        const driver = drivers.find((d) => d.id === driverId);
        if (!order || !driver) return false;

        if (driver.status !== "available") return false;

        setOrders((current) =>
          current.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "driver-assigned",
                  driver: driver.name,
                  driverPhone: driver.phone,
                  vehicle: driver.vehicle,
                }
              : o,
          ),
        );

        setDrivers((current) =>
          current.map((d) =>
            d.id === driverId
              ? { ...d, status: "on-delivery", currentOrderId: orderId }
              : d,
          ),
        );

        return true;
      },
      updateDriverStatus(driverId, status) {
        setDrivers((current) =>
          current.map((d) =>
            d.id === driverId
              ? {
                  ...d,
                  status,
                  currentOrderId:
                    status === "on-delivery" ? d.currentOrderId : undefined,
                }
              : d,
          ),
        );
        return true;
      },
      createDeliveryOrder(input) {
        const sequence =
          orders
            .filter((order) => order.id.startsWith("D-"))
            .map((order) => Number(order.id.split("-")[1]))
            .reduce((highest, current) => Math.max(highest, current), 88) + 1;
        const id = `D-${String(sequence).padStart(3, "0")}`;
        const now = new Date().toLocaleTimeString("es-GT", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const order: DeliveryOrder = {
          id,
          source: `Delivery · ${input.customer}`,
          customer: input.customer,
          address: input.address,
          phone: input.phone,
          items: input.items,
          status: "waiting",
          createdAt: now,
          elapsed: "Ahora",
          eta: input.eta ?? "28 min",
          paymentMethod: input.paymentMethod ?? "cash",
          paymentStatus: "pending",
          total: getDeliveryTotal(input.items),
          notes: input.notes,
          isDemo: input.isDemo,
        };
        setOrders((current) => [order, ...current]);
        return id;
      },
    }),
    [orders, drivers],
  );

  return (
    <DeliverySessionContext.Provider value={value}>
      {children}
    </DeliverySessionContext.Provider>
  );
}

export function useDeliverySession() {
  const context = useContext(DeliverySessionContext);
  if (!context) {
    throw new Error("useDeliverySession must be used inside DeliverySessionProvider");
  }
  return context;
}